// The dashboard's client assets, embedded into the CLI bundle as text imports (`with { type: "text" }`).
declare module "*.txt" {
  const text: string;
  export default text;
}

declare module "*.html" {
  const text: string;
  export default text;
}
