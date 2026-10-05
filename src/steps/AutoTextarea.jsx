import { useLayoutEffect, useRef } from "react";

// A textarea that grows with its text, so a long service line or note wraps
// in full instead of scrolling inside a one-line box.
export default function AutoTextarea({ value, style, ...props }) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const el = ref.current;
    el.style.height = "auto";
    // scrollHeight leaves out the border, which border-box sizing counts.
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      style={{ ...style, resize: "none", overflow: "hidden" }}
      {...props}
    />
  );
}
