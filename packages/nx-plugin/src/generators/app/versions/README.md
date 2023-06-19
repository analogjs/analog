# Nx, Angular, and Analog Versions

Since we rely on Nx as a way to keep our repository up to date,
Analog also follows Nx migrations when it comes to staying in sync with the latest Angular version.

This means that as Nx releases support for the next Angular version, Analog will adopt it and release support for it.

## Nx, Angular, and Analog Version Compatibility Matrix

Below is a reference table that matches versions of Nx and Angular with the Analog version that is compatible with it.
The table shows the version of Nx, the recommended version of Nx to use, and the minimum version of Analog that is needed.

As Analog becomes stable we will provide a recommended version. It will usually be the latest minor version of Analog
in the range provided because there will have been bug fixes added since the first release in the range.

| Nx Version _(min)_ | Angular Version | Analog Version _(range)_          |
| ------------------ | --------------- | --------------------------------- |
| latest             | ~16.1.0         | **0.2.0-beta.16 <= latest**       |
| 16.1.0             | ~16.0.0         | **0.2.0-beta.1 <= 0.2.0-beta.15** |
| 15.8.0             | ~15.2.0         | **0.2.0-beta.1 <= 0.2.0-beta.15** |
| 15.2.0             | ~15.0.0         | **0.0.0 <= 0.1.0-beta.23**        |
| < 15.2.0           | ~14.0.0         | **not supported**                 |

Additionally, you can check this [guide from Nx](https://nx.dev/packages/angular/documents/angular-nx-version-matrix)
to learn more about Nx and Angular compatibility.
