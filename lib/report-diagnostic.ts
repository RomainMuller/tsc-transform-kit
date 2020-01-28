import { resolve } from 'path';
import { Diagnostic, FormatDiagnosticsHost, formatDiagnosticsWithColorAndContext, sys } from 'typescript';

const FORMAT_HOST: FormatDiagnosticsHost = {
  getCanonicalFileName: resolve,
  getCurrentDirectory: sys.getCurrentDirectory,
  getNewLine: () => sys.newLine,
};

/**
 * Reports multiple `Diagnostic` elements.
 *
 * @param diagnostics the `Diagnostic` objects to be reported.
 * @param writer      the `MessageWriter` function to use for displaying entries. The default writer is `console.error`.
 * @param host        the `FormatDiagnosticHost` to use. The default host uses the standard `typescript.sys` primitives.
 */
export function reportDiagnostics(
  diagnostics: readonly Diagnostic[],
  writer: MessageWriter = console.error,
): void {
  writer(formatDiagnosticsWithColorAndContext(diagnostics, FORMAT_HOST));
}

/**
 * Reports a single `Diagnostic`.
 *
 * @param diagnostic the `Diagnostic` to be reported.
 * @param writer     the `MessageWriter` function to use for displaying.
 * @param host       the `FormatDiagnosticHost` to use.
 */
export function reportDiagnostic(
  diagnostic: Diagnostic,
  writer?: MessageWriter,
): void {
  reportDiagnostics([diagnostic], writer);
}

/**
 * Renders a message to the user.
 *
 * @param message the message to be displayed to the user.
 */
export type MessageWriter = (message: string) => void;
