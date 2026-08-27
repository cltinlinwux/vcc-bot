# Security Policy

## Supported Versions

Only the latest version on the `main` branch is supported with security updates.

## Reporting a Vulnerability

Please do **not** open a public GitHub issue for security vulnerabilities.

Instead, report them privately:

1. Use [GitHub private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability) on this repository ("Security" tab → "Report a vulnerability"), or
2. Contact a maintainer directly if private reporting is unavailable.

Include as much of the following as you can:

- A description of the vulnerability and its impact
- Steps to reproduce (a proof of concept helps a lot)
- Affected component (backend API, WebSocket layer, frontend, Discord bot)

You can expect an acknowledgement within a few days. Please give us a
reasonable window to release a fix before disclosing publicly.

## Scope Notes

- Never commit real secrets. Use `.env` locally (see `.env.example`); it is
  gitignored.
- `JWT_SECRET` must be set to a long random value in production — the backend
  refuses to boot with a known placeholder value.
