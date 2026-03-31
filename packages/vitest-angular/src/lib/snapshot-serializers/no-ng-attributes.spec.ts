import { describe, expect, it } from 'vitest';
import {
  attributesToRemovePatterns,
  createNoNgAttributesSnapshotSerializer,
} from './no-ng-attributes';

expect.addSnapshotSerializer(createNoNgAttributesSnapshotSerializer());

describe('no-ng-attributes snapshot serializer', () => {
  it('matches elements with Angular attributes to remove', () => {
    const div = document.createElement('div');

    attributesToRemovePatterns.forEach((attrToRemove) => {
      div.setAttribute(attrToRemove, 'attr-value');
    });

    expect(div).toMatchInlineSnapshot(`<div />`);
  });

  it('cleans valid Angular-generated class values', () => {
    const div = document.createElement('section');

    div.setAttribute(
      'class',
      'keep-me ng-star-inserted keep-me-too mat-input-1-2 keep-me-three',
    );

    expect(div).toMatchInlineSnapshot(`
      <section
        class="keep-me keep-me-too keep-me-three"
      />
    `);
  });

  it('preserves non-Angular class values', () => {
    const div = document.createElement('section');

    div.setAttribute('class', 'keep-me');

    expect(div).toMatchInlineSnapshot(`
      <section
        class="keep-me"
      />
    `);
  });

  it('cleans valid Angular-generated id values', () => {
    const div = document.createElement('section');

    div.setAttribute('id', 'mat-input-3');

    expect(div).toMatchInlineSnapshot(`<section />`);
  });

  it('preserves non-Angular id values', () => {
    const div = document.createElement('section');

    div.setAttribute('id', 'custom-id');

    expect(div).toMatchInlineSnapshot(`
      <section
        id="custom-id"
      />
    `);
  });

  it('cleans valid Angular-generated for values', () => {
    const div = document.createElement('section');

    div.setAttribute('for', 'mat-input-4');

    expect(div).toMatchInlineSnapshot(`<section />`);
  });

  it('preserves non-Angular for values', () => {
    const div = document.createElement('section');

    div.setAttribute('for', 'custom-input');

    expect(div).toMatchInlineSnapshot(`
      <section
        for="custom-input"
      />
    `);
  });

  it('cleans valid Angular-generated aria-owns values', () => {
    const div = document.createElement('section');

    div.setAttribute('aria-owns', 'mat-input-5');

    expect(div).toMatchInlineSnapshot(`<section />`);
  });

  it('preserves non-Angular aria-owns values', () => {
    const div = document.createElement('section');

    div.setAttribute('aria-owns', 'custom-panel');

    expect(div).toMatchInlineSnapshot(`
      <section
        aria-owns="custom-panel"
      />
    `);
  });

  it('cleans valid Angular-generated aria-labelledby values', () => {
    const div = document.createElement('section');

    div.setAttribute('aria-labelledby', 'mat-input-6');

    expect(div).toMatchInlineSnapshot(`<section />`);
  });

  it('preserves non-Angular aria-labelledby values', () => {
    const div = document.createElement('section');

    div.setAttribute('aria-labelledby', 'custom-label');

    expect(div).toMatchInlineSnapshot(`
      <section
        aria-labelledby="custom-label"
      />
    `);
  });

  it('cleans valid Angular-generated aria-controls values', () => {
    const div = document.createElement('section');

    div.setAttribute('aria-controls', 'mat-input-7');

    expect(div).toMatchInlineSnapshot(`<section />`);
  });

  it('preserves non-Angular aria-controls values', () => {
    const div = document.createElement('section');

    div.setAttribute('aria-controls', 'custom-controls');

    expect(div).toMatchInlineSnapshot(`
      <section
        aria-controls="custom-controls"
      />
    `);
  });

  it('strips Angular-specific attributes from the printed node', () => {
    const doc = new DOMParser().parseFromString(
      '<div id="root0" ng-version="21.1.3" _nghost-a-c1="" class="card ng-star-inserted keep-me"><span class="card ng-star-inserted" _ngcontent-a-c1="" ng-reflect-foo="bar">Title</span></div>',
      'text/html',
    );

    expect(doc.body).toMatchInlineSnapshot(`
      <body>
        <div
          class="card keep-me"
        >
          <span
            class="card"
          >
            Title
          </span>
        </div>
      </body>
    `);
  });
});
