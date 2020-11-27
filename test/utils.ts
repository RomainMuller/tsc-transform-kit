import {
  access,
  constants,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  rmdir,
  unlink,
} from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { promisify } from 'util';

/**
 * Runs a block of code with a temporary copy of the given path. The copy is
 * destroyed after the block has completed (i.e: after its promise has resolved
 * or rejected).
 *
 * @param path     the path of which a temporary copy is to be made.
 * @param callback the function to invoke with the temporary copy.
 */
export async function withTemporaryCopy<T>(
  path: string,
  callback: (copyRoot: string) => Promise<T>,
): Promise<T> {
  const tmp = await promisify(mkdtemp)(
    join(tmpdir(), 'tsc-transform-kit-copy-'),
  );
  await copyDirectory(path, tmp);
  return callback(tmp).then(
    (value) => {
      return rmrf(tmp).then(
        () => value,
        (reason) => Promise.reject(reason),
      );
    },
    (reason) => {
      return rmrf(tmp).then(
        () => Promise.reject(reason),
        (reason) => Promise.reject(reason),
      );
    },
  );
}

/**
 * Asynchronously copies a whole directory tree.
 *
 * @param from the source directory to copy from.
 * @param to   the target directory to copy into.
 */
async function copyDirectory(from: string, to: string): Promise<void> {
  const files = await promisify(readdir)(from);
  await Promise.all(
    files.map(async (file) => {
      const source = join(from, file);
      const target = join(to, file);

      const stat = await promisify(lstat)(source);
      if (stat.isDirectory()) {
        if (!(await exists(target))) {
          await promisify(mkdir)(target);
        }
        return copyDirectory(source, target);
      }
      return promisify(copyFile)(source, target);
    }),
  );
}

/**
 * Checks if a file exists.
 *
 * @param path the path to be checked.
 */
async function exists(path: string): Promise<boolean> {
  return promisify(access)(path, constants.F_OK).then(
    () => true,
    () => false,
  );
}

/**
 * Removes a directory recursively. This operation idempotently succeeds if the
 * file does not exist.
 *
 * @param path the path to be removed.
 */
async function rmrf(path: string): Promise<void> {
  if (!(await exists(path))) {
    return;
  }
  const stat = await promisify(lstat)(path);
  if (stat.isDirectory()) {
    const files = await promisify(readdir)(path);
    await Promise.all(files.map((file) => rmrf(resolve(path, file))));
    await promisify(rmdir)(path);
  } else {
    await promisify(unlink)(path);
  }
}
