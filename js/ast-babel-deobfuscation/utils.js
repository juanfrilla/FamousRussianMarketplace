export const PROTO_METHODS = new Set([
  "hasOwnProperty",
  "isPrototypeOf",
  "propertyIsEnumerable",
  "toString",
  "toLocaleString",
  "valueOf",
  "constructor",
]);
import * as t from "@babel/types";
export function isPropMutated(binding, propKey) {
  const objName = binding.path.node.id.name;
  for (var rp of binding.referencePaths) {
    let memberPath = rp.parentPath;
    let mutationPath = memberPath.parentPath;
    if (!mutationPath) continue;

    // Caso 1: obj.prop++ / --obj.prop
    if (t.isUpdateExpression(mutationPath.node)) {
      if (
        t.isMemberExpression(memberPath.node) &&
        (memberPath.node.object.name === objName ||
          memberPath.node.property.name === propKey)
      ) {
        return true;
      }
    }

    // Caso 2: obj.prop = valor / obj.prop += valor
    if (t.isAssignmentExpression(mutationPath.node)) {
      if (
        mutationPath.node.operator !== "=" &&
        mutationPath.node.left === memberPath.node &&
        memberPath.node.object.name === objName &&
        (memberPath.node.property.name === propKey ||
          memberPath.node.property.value === propKey)
      ) {
        return true;
      }
    }
  }
  return false;
}

export function resolveToRootBinding(currentName, scope) {
  let lastBinding = null;
  let currentScope = scope;

  while (currentName) {
    const binding = currentScope.getBinding(currentName);
    if (!binding) break;

    lastBinding = binding;
    const node = binding.path.node;
    const init = node.init;

    // Caso 1: var c = _0xc52c7c;  (VariableDeclarator con init Identifier)
    if (t.isVariableDeclarator(node) && init && t.isIdentifier(init)) {
      currentName = init.name;
      currentScope = binding.path.scope;
      continue;
    }

    // Caso 2: var l;  +  l = _0x1206;  (VariableDeclarator sin init, buscar en constantViolations)
    if (
      t.isVariableDeclarator(node) &&
      !init &&
      binding.constantViolations.length > 0
    ) {
      let aliasName = null;

      for (const violation of binding.constantViolations) {
        if (
          violation.isAssignmentExpression() &&
          t.isIdentifier(violation.node.left, { name: currentName }) &&
          t.isIdentifier(violation.node.right)
        ) {
          aliasName = violation.node.right.name;
          break;
        }
      }

      if (aliasName) {
        currentName = aliasName;
        currentScope = binding.path.scope;
        continue;
      }
    }

    // Caso 3: parámetro de función → buscar asignación dentro del scope
    if (binding.kind === "param") {
      let aliasName = null;

      binding.scope.path.traverse({
        AssignmentExpression(p) {
          if (
            t.isIdentifier(p.node.left, { name: currentName }) &&
            t.isIdentifier(p.node.right)
          ) {
            aliasName = p.node.right.name;
            p.stop();
          }
        },
      });

      if (aliasName) {
        currentName = aliasName;
        currentScope = binding.scope;
        continue;
      }
    }

    // No hay más alias → llegamos al final
    break;
  }

  return lastBinding;
}
export const createNode = (val) => {
  if (typeof val === "string" && val.startsWith("_0x")) {
    return t.identifier(val);
  }
  if (t.isAssignmentExpression(val)) {
    return val.right;
  }
  if (t.isNode(val)) {
    return val;
  }
  return t.valueToNode(val);
};

export function evaluate(operator, left, right) {
  switch (operator) {
    case "+":
      return left + right;
    case "-":
      return left - right;
    case "*":
      return left * right;
    case "/":
      return left / right;
    case "%":
      return left % right;
    case "**":
      return left ** right;
    default:
      return null;
  }
}
