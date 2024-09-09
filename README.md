# Amruth
CLI to install elixir dependencies with ease


**Installation:**

```bash
npm install -g amruth@latest
```

**Usage**

```bash
amruth <command> <options>
```

**Commands**

```bash
amruth install pow
```

![image](https://github.com/user-attachments/assets/3d05ca0b-324f-4115-a901-6ae026e49b36)

> You can use ⬆️ ⬇️ keys to iterate the result and use Space to select, enter to finalize

Existing packages are displayed as disabled to avoid duplicate dependencies being listed in the `mix.exs` file

![image](https://github.com/user-attachments/assets/7e12a705-0fbf-4db1-91cc-948d55c01e9c)

If a new version is available, then the option to upgrade it is also shown

![image](https://github.com/user-attachments/assets/15b98dd8-4e88-48f0-8ae9-b65eda66c892)

After adding the dependency to `mix.exs` file, the following commands are also run in succession 

1. `mix format`
2. `mix deps.get`

![image](https://github.com/user-attachments/assets/cf90965a-6e32-4ea8-845f-1579528b2cd9)


