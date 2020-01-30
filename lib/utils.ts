import * as ts from 'typescript';

/**
 * Retrieves the textual name for a `BindingName`.
 *
 * @param name the `BindingName` for which text is needed.
 *
 * @returns the textual expression for the name.
 */
export function getText(name: ts.BindingName | ts.PropertyName): string {
  if (ts.isArrayBindingPattern(name) || ts.isObjectBindingPattern(name)) {
    return getText(name.parent.name);
  } else if (ts.isComputedPropertyName(name)) {
    throw new Error('Cannot find textual representation of ComputedPropertyName elements!');
  }
  return name.text;
}
