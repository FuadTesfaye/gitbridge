/** Verify the token's owner before saving or replacing any credentials. */
export function verifyAccountUsername(expected: string | undefined, actual: string): void {
  if (expected !== undefined && expected.trim().toLowerCase() !== actual.toLowerCase()) {
    throw new Error(`This token belongs to '@${actual}', not the requested account '@${expected.trim()}'. No account was saved.`);
  }
}
