(function () {
  if (typeof Prism === 'undefined') {
    return;
  }

  Prism.languages.angular = Prism.languages.extend('markup', {
    keyword:
      /(?:@if|@for|@switch|@defer|@loading|@error|@placeholder|prefetch)\b/,
    operator: /\b(?:on|when)\b/,
    number: {
      pattern: /\b(minimum|after)\s+\d+(?:s|ms|)/gi,
      lookbehind: true,
    },
    builtin: {
      pattern:
        /\b(?:viewport|timer|minimum|after|hover|idle|immediate|interaction)/,
    },
    function:
      /#?(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?=\s*(?:\.\s*(?:apply|bind|call)\s*)?\()/,
  });

  Prism.languages.ng = Prism.languages.angular;
})();
