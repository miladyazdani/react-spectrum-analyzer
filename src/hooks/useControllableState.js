import { useCallback, useRef, useState } from "react";

/** `value === undefined` means uncontrolled; `null` stays a real value (e.g. "no ruler"). */
export function useControllableState(value, defaultValue, onChange) {
    const [inner, setInner] = useState(defaultValue);
    const controlled = value !== undefined;

    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    const set = useCallback((next) => {
        if (!controlled) setInner(next);
        onChangeRef.current?.(next);
    }, [controlled]);

    return [controlled ? value : inner, set];
}
