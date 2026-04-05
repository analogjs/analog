import { describe, expect, it } from 'vitest';
import { createHtmlCommentSnapshotSerializer } from './html-comment';

expect.addSnapshotSerializer(createHtmlCommentSnapshotSerializer());

describe('html-comment snapshot serializer', () => {
  it('serializes comments to an empty string', () => {
    expect(document.createComment('container')).toMatchInlineSnapshot(``);
  });

  it('serializes comments to an empty string within elements', () => {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode('Hello'));
    div.appendChild(document.createComment('container'));
    div.appendChild(document.createTextNode('Hello 2'));

    expect(div).toMatchInlineSnapshot(`
      <div>
        Hello
        
        Hello 2
      </div>
    `);
  });

  it(`does not modify non-comment nodes`, () => {
    expect({}).toMatchInlineSnapshot(`{}`);
    expect([]).toMatchInlineSnapshot(`[]`);
    expect('Hello').toMatchInlineSnapshot(`"Hello"`);
    expect(123).toMatchInlineSnapshot(`123`);
    expect(true).toMatchInlineSnapshot(`true`);
    expect(false).toMatchInlineSnapshot(`false`);
    expect(null).toMatchInlineSnapshot(`null`);
    expect(undefined).toMatchInlineSnapshot(`undefined`);
  });
});
