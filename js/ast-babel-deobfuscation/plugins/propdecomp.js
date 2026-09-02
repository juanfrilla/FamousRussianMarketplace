export default function (babel) {
  const { types: t } = babel;
  return {
    name: "property-decomputer",
    visitor: {
      ObjectProperty(path) {
        const { key, computed } = path.node;
        if (computed && t.isStringLiteral(key)) {
          const isValidIdentifier = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(
            key.value,
          );

          if (isValidIdentifier) {
            path.node.key = t.identifier(key.value);
            path.node.computed = false;
          }
        }
      },
      MemberExpression(path) {
        const { property, computed } = path.node;

        if (computed && t.isStringLiteral(property)) {
          const isValidIdentifier = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(
            property.value,
          );

          if (isValidIdentifier) {
            path.node.property = t.identifier(property.value);
            path.node.computed = false;
          }
        }
      },
    },
  };
}
