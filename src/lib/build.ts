/**
 * Build of this binary inside the current version. Resets to 1 on a new version
 * and is incremented by hand for fix builds of the same version.
 */
export const BUILD_NUMBER = 2;

/** Display-only build label derived from the number above. */
export const BUILD_LABEL = `build ${BUILD_NUMBER}`;
