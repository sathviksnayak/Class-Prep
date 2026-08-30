import type { ChangeEventHandler, ReactNode } from "react";

type FormFieldProps = {
  label: string;
  id: string;
  type?: "text" | "number" | "select";
  placeholder?: string;
  value?: string | number;
  onChange?: ChangeEventHandler<HTMLInputElement | HTMLSelectElement>;
  options?: { label: string; value: string }[];
  helperText?: ReactNode;
  className?: string;
};

export function FormField({
  label,
  id,
  type = "text",
  placeholder,
  value,
  onChange,
  options = [],
  helperText,
  className = "",
}: FormFieldProps) {
  return (
    <label htmlFor={id} className={`block ${className}`}>
      <span className="mb-2 block text-sm font-medium text-[#1f2d27]">{label}</span>
      {type === "select" ? (
        <select
          id={id}
          value={value}
          onChange={onChange}
          className="w-full rounded-xl border border-[#d8e0d9] bg-white px-3.5 py-2.5 text-sm text-[#1f2d27] outline-none transition focus:border-[#2f6f4b] focus:ring-2 focus:ring-[#dfeee5]"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className="w-full rounded-xl border border-[#d8e0d9] bg-white px-3.5 py-2.5 text-sm text-[#1f2d27] outline-none transition placeholder:text-[#6a786f] focus:border-[#2f6f4b] focus:ring-2 focus:ring-[#dfeee5]"
        />
      )}
      {helperText ? <span className="mt-2 block text-xs text-[#5a6a62]">{helperText}</span> : null}
    </label>
  );
}
