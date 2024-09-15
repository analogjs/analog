export interface ContentFile<
  Attributes extends Record<string, any> = Record<string, any>,
> {
  filename: string;
  slug: string;
  content?: string | object;
  attributes: Attributes;
}
