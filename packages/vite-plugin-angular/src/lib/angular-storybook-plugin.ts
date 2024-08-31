export function angularStorybookPlugin() {
  return {
    name: 'analogjs-storybook-import-plugin',
    transform(code: string) {
      if (code.includes('"@storybook/angular"')) {
        return code.replace(
          /\"@storybook\/angular\"/g,
          '"@storybook/angular/dist/client"'
        );
      }

      return;
    },
  };
}
