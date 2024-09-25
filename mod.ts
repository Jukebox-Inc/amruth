#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run --allow-net
import { ensureDir } from "jsr:@std/fs@^0.218.2";
import { join } from "jsr:@std/path@^0.218.2";
import { parse } from "jsr:@std/flags@^0.218.2";
import { Checkbox } from "jsr:@cliffy/prompt@1.0.0-rc.5";

const mixFilePath = join(Deno.cwd(), "mix.exs");

interface HexPackage {
  name: string;
  version: string;
  status?: "upgrade" | "installed" | undefined;
  currentVersion?: string;
}

/**
 * Searches for Hex packages based on the given query.
 * @param {string} query - The search term for Hex packages.
 * @returns {Promise<HexPackage[]>} A promise that resolves to an array of HexPackage objects.
 */
async function searchHexPackages(query: string): Promise<HexPackage[]> {
  const response = await fetch(`https://hex.pm/api/packages?search=${query}`);
  const data = await response.json();
  return data.map((pkg: any) => ({
    name: pkg.name,
    version: pkg.latest_version,
  }));
}

/**
 * Parses the mix.exs file to extract current dependencies and their versions.
 * @returns {Record<string, string>} An object with package names as keys and their versions as values.
 */
function parseMixExs(): Record<string, string> {
  try {
    const result = new TextDecoder().decode(
      Deno.runSync({ cmd: ["mix", "deps"], stdout: "piped" }).stdout,
    );
    const deps: Record<string, string> = {};

    result.split("\n").forEach((line) => {
      const match = line.match(/locked at\s+(\S+)\s+(\S+)/);
      if (match) {
        const [_, version, nameWithParens] = match;
        const cleanedName = nameWithParens.replace(/[()]/g, "");
        deps[cleanedName] = version;
      }
    });
    return deps;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      console.info("No Mix.Project found in the current directory.");
    } else {
      console.info("Error executing `mix deps`:", error.message);
    }
    return {};
  }
}

/**
 * Main function to handle the installation of Hex packages.
 * This function orchestrates the entire process of searching, selecting, and installing packages.
 */
async function installPackages() {
  const args = parse(Deno.args);
  const query = args._[0] as string;

  if (!query) {
    console.error("Please provide a search term.");
    Deno.exit(1);
  }

  const packages = await searchHexPackages(query);
  if (packages.length === 0) {
    console.log("No packages found.");
    return;
  }

  const existingDeps = parseMixExs();

  // Categorize and sort the packages
  const categorizedPackages: HexPackage[] = packages.map((pkg) => {
    if (existingDeps[pkg.name]) {
      if (existingDeps[pkg.name] !== pkg.version) {
        return {
          ...pkg,
          status: "upgrade",
          currentVersion: existingDeps[pkg.name],
        };
      } else {
        return {
          ...pkg,
          status: "installed",
          currentVersion: existingDeps[pkg.name],
        };
      }
    }
    return pkg;
  });

  const upgradePackages = categorizedPackages.filter(
    (pkg) => pkg.status === "upgrade",
  );
  const installablePackages = categorizedPackages
    .filter((pkg) => !pkg.status)
    .sort((a, b) => {
      const aRelevance = calculateRelevance(a.name, query);
      const bRelevance = calculateRelevance(b.name, query);
      if (aRelevance !== bRelevance) return bRelevance - aRelevance;
      return a.name.localeCompare(b.name);
    });
  const installedPackages = categorizedPackages.filter(
    (pkg) => pkg.status === "installed",
  );

  const choices = [
    ...installedPackages.map((pkg) => ({
      name: `${pkg.name} (${pkg.version}) - Already Installed`,
      value: pkg,
      disabled: true,
    })),
    ...upgradePackages.map((pkg) => ({
      name: `${pkg.name} (current: ${pkg.currentVersion}) -> Upgrade to ${pkg.version}`,
      value: pkg,
    })),
    ...installablePackages.map((pkg) => ({
      name: `${pkg.name} (${pkg.version})`,
      value: pkg,
    })),
  ];

  const selectedPackages = await Checkbox.prompt({
    message: "Select packages to install/upgrade",
    options: choices,
    minOptions: 0,
  });

  if (selectedPackages.length > 0) {
    await addToMixExs(selectedPackages);
    console.log("Dependencies updated in mix.exs");

    await formatAndFetchDeps();
  } else {
    console.log("No packages selected.");
  }
}

/**
 * Calculates the Levenshtein distance between two strings.
 * @param {string} a - The first string.
 * @param {string} b - The second string.
 * @returns {number} The Levenshtein distance between the two strings.
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculates the relevance of a package name to the searched word.
 * @param {string} name - The name of the package.
 * @param {string} searchedWord - The word being searched for.
 * @returns {number} A relevance score between 0 and 1.
 */
function calculateRelevance(name: string, searchedWord: string): number {
  const distance = levenshteinDistance(
    name.toLowerCase(),
    searchedWord.toLowerCase(),
  );
  return 1 - distance / Math.max(name.length, searchedWord.length);
}

/**
 * Adds selected packages to the mix.exs file.
 * @param {HexPackage[]} packages - An array of selected HexPackage objects to be added or upgraded.
 */
async function addToMixExs(packages: HexPackage[]) {
  let mixExsContent = await Deno.readTextFile(mixFilePath);
  const depsRegex = /defp deps do\s*\[\s*/;

  packages.forEach((pkg) => {
    if (pkg.status === "upgrade") {
      const existingDepRegex = new RegExp(
        `{:${pkg.name},\\s*"(\\d+\\.\\d+\\.\\d+)"?}`,
      );
      mixExsContent = mixExsContent.replace(
        existingDepRegex,
        (match, version) => {
          if (version.startsWith("~>")) {
            return `{:${pkg.name}, "~> ${pkg.version}"}`;
          } else {
            return `{:${pkg.name}, "${pkg.version}"}`;
          }
        },
      );
    } else {
      const newDep = `{:${pkg.name}, "~> ${pkg.version}"}`;
      mixExsContent = mixExsContent.replace(depsRegex, (match) => {
        return `${match}${newDep},\n    `;
      });
    }
  });

  await Deno.writeTextFile(mixFilePath, mixExsContent);
}

/**
 * Formats the mix.exs file and fetches dependencies using mix commands.
 */
async function formatAndFetchDeps() {
  try {
    console.log("Running mix deps.get...");
    const depsGet = Deno.run({ cmd: ["mix", "deps.get"] });
    await depsGet.status();

    console.log("Running mix format...");
    const format = Deno.run({ cmd: ["mix", "format"] });
    await format.status();

    console.log("Dependencies installed successfully.");
  } catch (error) {
    console.error("An error occurred while running mix commands:", error);
  }
}

if (import.meta.main) {
  await installPackages();
}
