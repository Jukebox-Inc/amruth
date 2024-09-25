#!/usr/bin/env node
/**
 * This module provides functionality for managing Hex packages in Elixir projects.
 * It includes functions for searching, installing, and upgrading Hex packages.
 * @module
 */
import * as fs from "fs";
import * as path from "path";
import axios from "axios";
import inquirer from "inquirer";
import { execSync } from "child_process";
var levenshtein = require("fast-levenshtein");

const mixFilePath = path.join(process.cwd(), "mix.exs");

interface HexPackage {
  name: string;
  version: string;
  status?: string; // "upgrade" | "installed" | undefined
  currentVersion?: string;
}

/**
 * Searches for Hex packages based on the given query.
 * @param {string} query - The search term for Hex packages.
 * @returns {Promise<HexPackage[]>} A promise that resolves to an array of HexPackage objects.
 */
async function searchHexPackages(query: string): Promise<HexPackage[]> {
  const response = await axios.get(
    `https://hex.pm/api/packages?search=${query}`,
  );
  return response.data.map((pkg: any) => ({
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
    const result = execSync('mix deps | grep "locked at"', {
      encoding: "utf8",
    });
    const deps: Record<string, string> = {};

    result.split("\n").forEach((line) => {
      // Handle cases with "locked at"
      const match = line.match(/locked at\s+(\S+)\s+(\S+)/);

      if (match) {
        const [_, version, nameWithParens] = match; // Capture the name with parentheses
        var cleanedName = nameWithParens.replace("(", ""); // Remove parentheses
        cleanedName = cleanedName.replace(")", "");
        deps[cleanedName] = version;
      }
    });
    return deps;
  } catch (error: any) {
    // Handle cases where `mix deps` fails or returns an empty result
    if (error.stderr.includes("Could not find a Mix.Project")) {
      console.info("No Mix.Project found in the current directory.");
    } else {
      // console.info("Error executing `mix deps`:", error.message);
    }

    return {};
  }
}

/**
 * Main function to handle the installation of Hex packages.
 * This function orchestrates the entire process of searching, selecting, and installing packages.
 */
async function installPackages() {
  const args = process.argv.slice(2);
  const query = args[1];

  if (!query) {
    console.error("Please provide a search term.");
    process.exit(1);
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

      // Sort alphabetically as a tiebreaker
      return a.name.localeCompare(b.name);
    });
  const installedPackages = categorizedPackages.filter(
    (pkg) => pkg.status === "installed",
  );

  /**
   * Calculates the relevance of a package name to the searched word.
   * @param {string} name - The name of the package.
   * @param {string} searchedWord - The word being searched for.
   * @returns {number} A relevance score between 0 and 1.
   */
  function calculateRelevance(name: string, searchedWord: string): number {
    // Use the Levenshtein distance algorithm to calculate similarity
    const distance = levenshtein.get(
      name.toLowerCase(),
      searchedWord.toLowerCase(),
    );

    // Convert distance to a relevance score (higher distance means lower relevance)
    const relevance = 1 - distance / Math.max(name.length, searchedWord.length);

    return relevance;
  }

  const choices = [
    ...installedPackages.map((pkg) => ({
      name: `${pkg.name} (${pkg.version}) - Already Installed`,
      value: pkg,
      disabled: true,
    })),
    ...upgradePackages.map((pkg) => ({
      name:
        `${pkg.name} (current: ${pkg.currentVersion}) -> Upgrade to ${pkg.version}`,
      value: pkg,
    })),
    ...installablePackages.map((pkg) => ({
      name: `${pkg.name} (${pkg.version})`,
      value: pkg,
    })),
  ];

  const answers = await inquirer.prompt([
    {
      type: "checkbox",
      name: "selectedPackages",
      message: "Select packages to install/upgrade",
      choices,
      loop: false,
    },
  ]);

  if (answers.selectedPackages.length > 0) {
    addToMixExs(answers.selectedPackages);
    console.log("Dependencies updated in mix.exs");

    formatAndFetchDeps();
  } else {
    console.log("No packages selected.");
  }
}

/**
 * Adds selected packages to the mix.exs file.
 * @param {HexPackage[]} packages - An array of selected HexPackage objects to be added or upgraded.
 */
function addToMixExs(packages: HexPackage[]) {
  let mixExsContent = fs.readFileSync(mixFilePath, "utf8");
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

  fs.writeFileSync(mixFilePath, mixExsContent, "utf8");
}

/**
 * Formats the mix.exs file and fetches dependencies using mix commands.
 */
function formatAndFetchDeps() {
  try {
    console.log("Running mix deps.get...");
    execSync("mix deps.get", { stdio: "inherit" });

    console.log("Running mix format...");
    execSync("mix format", { stdio: "inherit" });

    console.log("Dependencies installed successfully.");
  } catch (error) {
    console.error("An error occurred while running mix commands:", error);
  }
}

installPackages();
