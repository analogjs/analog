---
sidebar_position: 5
id: mcp-setup
---

# MCP (Model Context Protocol) Setup

This document explains how to set up and use MCP servers in the Analog workspace for enhanced AI assistance.

## Overview

The workspace is configured with two MCP servers:

1. **Nx MCP** - Provides Nx workspace-specific AI assistance
2. **Angular MCP** - Provides Angular-specific AI assistance

## Supported Editors

### Cursor

- Configuration: `.cursor/mcp.json`
- Automatically configured for the workspace

### VS Code

- Configuration: `.vscode/settings.json`
- MCP servers are configured in the `mcp.servers` section

### JetBrains IDEs

- JetBrains IDEs do not support code-based MCP server configuration
- Manual setup required through the IDE settings

## MCP Server Details

### Nx MCP Server

- **URL**: `http://localhost:9376/mcp`
- **Purpose**: Provides Nx workspace-specific tools and assistance
- **Features**:
  - Workspace analysis and project graph visualization
  - Generator assistance and project creation
  - Task execution and monitoring
  - CI/CD pipeline management
  - Documentation access

### Angular MCP Server

- **URL**: `http://localhost:4200/mcp`
- **Purpose**: Provides Angular-specific AI assistance
- **Features**:
  - Angular component and service generation
  - Angular CLI command assistance
  - Angular best practices and patterns
  - Angular-specific debugging help
  - Angular documentation access

## Setup Instructions

### Prerequisites

1. **Nx MCP Server**:

   ```bash
   # Install Nx MCP server globally
   npm install -g @nx/mcp-server

   # Start the Nx MCP server
   nx-mcp-server
   ```

2. **Angular MCP Server**:

   ```bash
   # Install Angular MCP server globally
   npm install -g @angular/mcp-server

   # Start the Angular MCP server
   angular-mcp-server
   ```

### Editor Configuration

#### Cursor

The workspace is already configured with the MCP servers in `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "nx-mcp": {
      "url": "http://localhost:9376/mcp"
    },
    "angular-mcp": {
      "url": "http://localhost:4200/mcp"
    }
  }
}
```

#### VS Code

The workspace is configured with MCP servers in `.vscode/settings.json`:

```json
{
  "mcp.servers": {
    "nx-mcp": {
      "url": "http://localhost:9376/mcp"
    },
    "angular-mcp": {
      "url": "http://localhost:4200/mcp"
    }
  }
}
```

#### JetBrains IDEs

1. Open Settings/Preferences
2. Navigate to AI Assistant → MCP Servers
3. Add the following servers:
   - **Nx MCP**: `http://localhost:9376/mcp`
   - **Angular MCP**: `http://localhost:4200/mcp`

## Usage

### Nx MCP Features

- **Workspace Analysis**: Ask about project structure and dependencies
- **Code Generation**: Generate components, services, and other Angular artifacts
- **Task Management**: Execute and monitor Nx tasks
- **Project Graph**: Visualize project dependencies
- **CI/CD**: Manage and debug CI pipeline issues

### Angular MCP Features

- **Component Generation**: Create Angular components with best practices
- **Service Creation**: Generate Angular services and injectables
- **CLI Commands**: Get assistance with Angular CLI commands
- **Debugging**: Help with Angular-specific debugging issues
- **Best Practices**: Guidance on Angular patterns and conventions

## Troubleshooting

### Common Issues

1. **MCP Server Not Found**:

   - Ensure the MCP servers are running on the correct ports
   - Check firewall settings
   - Verify the URLs in the configuration files

2. **Connection Timeout**:

   - Restart the MCP servers
   - Check if the ports are already in use
   - Verify network connectivity

3. **Editor Not Recognizing MCP**:
   - Restart the editor
   - Check if the MCP extension is installed (VS Code)
   - Verify the configuration file syntax

### Port Conflicts

If you encounter port conflicts:

- **Nx MCP**: Default port 9376
- **Angular MCP**: Default port 4200

You can change the ports by:

1. Starting the servers with different ports
2. Updating the URLs in the configuration files
3. Ensuring the new ports are available

## Additional Resources

- [Nx MCP Documentation](https://nx.dev/ai/mcp)
- [Angular MCP Documentation](https://angular.dev/ai/mcp)
- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [Cursor MCP Setup](https://cursor.sh/docs/mcp)
- [VS Code MCP Extension](https://marketplace.visualstudio.com/items?itemName=modelcontextprotocol.vscode-mcp)
