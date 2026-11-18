import { useCallback } from "react";
import { useIntl } from "react-intl";

type Values = Record<string, string | number>;

// Short translate helper: t("hud.title") or t("table.caption", { count: 5000 }).
export const useT = () => {
  const intl = useIntl();
  return useCallback((id: string, values?: Values): string => intl.formatMessage({ id }, values), [intl]);
};
