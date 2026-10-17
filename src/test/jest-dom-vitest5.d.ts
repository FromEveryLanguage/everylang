// TEMPORARY WORKAROUND for https://github.com/testing-library/jest-dom/issues/738
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

declare module 'vitest' {
  // Merging into vitest's interface needs an empty body and its exact type parameters, used or not.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unused-vars
  interface Matchers<R, T> extends TestingLibraryMatchers<unknown, R> {}
}
