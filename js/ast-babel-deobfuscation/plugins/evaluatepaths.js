export default function (babel) {
  const { types: t } = babel;
  return {
    name: "evaluatepaths",
    visitor: {
      BinaryExpression(path) {
        const result = path.evaluate();
        if (result.confident) {
          const newNode = t.valueToNode(result.value);
          if (t.isLiteral(newNode)) {
            path.replaceWith(newNode);
            path.skip();
          }
        }
      },
    },
  };
}
