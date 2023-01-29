export interface ContentFile<
  Attributes extends Record<string, any> = Record<string, any>
> {
  filename: string;
  content?: string;
  attributes: Attributes;
}
