# Nx, Angular, and Analog Versions

Since we rely on Nx as a way to keep our repository up to date,
Analog also follows Nx migrations when it comes to staying in sync with the latest Angular version.

This means that as Nx releases support for the next Angular version, Analog will adopt it and release support for it.

In addition to the latest version of Angular (16.x) we support the latest
Angular 15.x version for backwards compatibility.

## Nx, Angular, and Analog Version Compatibility Matrix

Below is a reference table that matches versions of Nx and Angular with the Analog version that is compatible with it.
The table shows the minimum version of Nx, the supported Angular version, and the minimum supported version of Analog.

Currently the newest minor versions of Angular 15 and Angular 16 are supported.
It is not planned to support all minor versions within a major Angular version.

As Analog becomes stable we will provide a recommended version. It will usually be the latest minor version of Analog
in the range provided because there will have been bug fixes added since the first release in the range.

| Nx Version _(min)_ | Angular Version | Analog Version    |
| ------------------ | --------------- | ----------------- |
| 17.0.0             | ^16.2.0         | **latest**        |
| 16.1.0             | ^16.1.0         | **latest**        |
| 16.0.0             | ~15.2.X         | **0.1.0-beta.22** |
| 15.2.0             | ~15.2.X         | **0.1.0-beta.22** |
| < 15.2.0           | ~14.0.0         | **not supported** |

Additionally, you can check this [guide from Nx](https://nx.dev/packages/angular/documents/angular-nx-version-matrix)
to learn more about Nx and Angular compatibility.
