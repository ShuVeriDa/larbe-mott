import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from "class-validator";

const MAX_DEPTH = 30;

function isValidNode(node: unknown, depth: number): boolean {
  if (depth > MAX_DEPTH) return false;
  if (node === null || typeof node !== "object" || Array.isArray(node))
    return false;

  const n = node as Record<string, unknown>;
  if (typeof n.type !== "string") return false;

  if (n.type === "text") {
    return (
      typeof n.text === "string" &&
      (n.marks === undefined || Array.isArray(n.marks))
    );
  }

  if (n.content !== undefined) {
    if (!Array.isArray(n.content)) return false;
    for (const child of n.content) {
      if (!isValidNode(child, depth + 1)) return false;
    }
  }
  return true;
}

function isTiptapDoc(value: unknown): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return false;

  const obj = value as Record<string, unknown>;
  if (obj.type !== "doc") return false;
  if (obj.content !== undefined && !Array.isArray(obj.content)) return false;

  const content = obj.content as unknown[] | undefined;
  if (!content) return true;

  for (const node of content) {
    if (!isValidNode(node, 0)) return false;
  }
  return true;
}

export function IsTiptapDoc(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: "isTiptapDoc",
      target: object.constructor,
      propertyName,
      options: validationOptions ?? {
        message:
          "contentRich must be a valid TipTap document (type: 'doc', content: array)",
      },
      validator: {
        validate(value: unknown, _args: ValidationArguments) {
          return isTiptapDoc(value);
        },
      },
    });
  };
}
