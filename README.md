# Amruth
![NPM Version](https://img.shields.io/npm/v/amruth)  ![JSR Version](https://img.shields.io/jsr/v/%40jobin/amruth)

CLI to install elixir dependencies with ease

**Installation:**

```bash
// For Node JS
npm install -g amruth@latest

// For Deno
deno install -g jsr:@jobin/amruth --allow-env --allow-read --allow-write --allow-net --allow-run
```

**Usage**

```bash
amruth <command> <options>
```

**Commands**

```bash
amruth install pow
```

| Node | Deno |
|---|---|
| ![image](https://github.com/user-attachments/assets/ca25009e-7fb4-4330-b1be-b24b5bd70c8d) | ![image](https://github.com/user-attachments/assets/36ff235e-e24a-4737-a9ea-bdcb8e3471f5) |



> You can use ⬆️ ⬇️ keys to iterate the result and use Space to select, enter to
> finalize

Existing packages are displayed as disabled to avoid duplicate dependencies
being listed in the `mix.exs` file

| Node | Deno |
|---|---|
| ![image](https://github.com/user-attachments/assets/0485a69d-e700-459c-80ae-71446cfe8f61) | ![image](https://github.com/user-attachments/assets/19a9d932-4cb0-4cd3-ac7e-247f9e2e30fa) |


If a new version is available, then the option to upgrade it is also shown

| Node | Deno |
|---|---|
| ![image](https://github.com/user-attachments/assets/809d8e00-74ce-4d33-9f44-32af8ea6bda2) | ![image](https://github.com/user-attachments/assets/5d88870c-4270-4461-8813-8433b1a8a726) |

After adding the dependency to `mix.exs` file, the following commands are also
run in succession

1. `mix format`
2. `mix deps.get`

![image](https://github.com/user-attachments/assets/cf90965a-6e32-4ea8-845f-1579528b2cd9)
