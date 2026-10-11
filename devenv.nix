{ pkgs, ... }:

{
  # Frontend, backend tests, packaging and deploying.
  # The layer itself is aarch64 Linux code: CI builds it (see .github/workflows/build.yml),
  # `just fetch-layer` downloads that build.
  languages.javascript = {
    enable = true;
    package = pkgs.nodejs_22;
    pnpm = {
      enable = true;
      package = pkgs.pnpm;
    };
  };

  languages.python = {
    enable = true;
    package = pkgs.python3.withPackages (ps: [ ps.pytest ]);
  };

  packages = [
    pkgs.just
    pkgs.zip
    pkgs.gh
    pkgs.rsync
    pkgs.pyright
  ];

  enterTest = ''
    just test
  '';
}
