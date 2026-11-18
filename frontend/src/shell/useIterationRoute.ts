import { useCallback, useEffect, useState } from "react";

// Turn "#/naive" into "naive", or null if it is not a known iteration (e.g. "#main" from the skip link).
const parse = (hash: string, ids: readonly string[]): string | null => {
  const id = hash.replace(/^#\/?/, "");
  return ids.includes(id) ? id : null;
};

/** Active iteration, kept in the URL hash so a tab can be linked to and survives reload. */
export function useIterationRoute(ids: readonly string[], fallback: string): [string, (id: string) => void] {
  const [active, setActive] = useState(() => parse(window.location.hash, ids) ?? fallback);

  // Follow the hash when it changes (tab clicks, back and forward buttons); ignore unknown hashes.
  useEffect(() => {
    const onHashChange = () => {
      const id = parse(window.location.hash, ids);
      if (id) setActive(id);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [ids]);

  // Selecting a tab only sets the hash; the listener above updates the state.
  const select = useCallback((id: string) => {
    window.location.hash = `/${id}`;
  }, []);

  return [active, select];
}
