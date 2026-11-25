import { useCallback, useId, useMemo } from "react";

import { Asterisk, Info } from "lucide-react";
import type {
  Control,
  ControllerFieldState,
  ControllerRenderProps,
  FieldValues,
  Path,
} from "react-hook-form";
import { Controller } from "react-hook-form";

import { Field, FieldDescription, FieldError, FieldLabel } from "../ui/field";
import {
  SearchableSelector,
  SearchableSelectorContent,
  SearchableSelectorItem,
  SearchableSelectorTrigger,
} from "../ui/searchable-selector";

type SearchableSelectorValue = string | Array<string>;

export interface SearchableSelectorFieldRenderState {
  value: SearchableSelectorValue | undefined;
  selectedIds: Array<string>;
  onChange: (value: SearchableSelectorValue | undefined) => void;
}

interface SearchableSelectorFieldProps<
  TFieldValues extends FieldValues,
  TItem,
  TTransformedValues = TFieldValues,
> {
  name: Path<TFieldValues>;
  control: Control<TFieldValues, any, TTransformedValues>;
  label?: string;
  description?: string;
  isDescriptionInfoIconShow?: boolean;
  requiredField?: boolean;
  disabled?: boolean;
  multiple?: boolean;
  placeholder?: string;
  searchDebounceMs?: number;
  onSearch: (searchValue: string) => void;
  data: TItem[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  title?: string;
  contentDescription: string;
  searchPlaceholder?: string;
  loadingFallback: React.ReactNode;
  emptyFallback: React.ReactNode;
  errorFallback?: (error: Error) => React.ReactNode;
  getItemId: (item: TItem) => string;
  renderItem: (item: TItem) => React.ReactNode;
  renderTrigger: (state: SearchableSelectorFieldRenderState) => React.ReactNode;
  renderBeforeTrigger?: (
    state: SearchableSelectorFieldRenderState
  ) => React.ReactNode;
}

export function SearchableSelectorField<
  TFieldValues extends FieldValues,
  TItem,
  TTransformedValues = TFieldValues,
>({
  name,
  control,
  label,
  description,
  isDescriptionInfoIconShow = false,
  requiredField = false,
  disabled = false,
  multiple = false,
  placeholder = "Select",
  searchDebounceMs,
  onSearch,
  data,
  isLoading,
  isError,
  error,
  title,
  contentDescription,
  searchPlaceholder,
  loadingFallback,
  emptyFallback,
  errorFallback,
  getItemId,
  renderItem,
  renderTrigger,
  renderBeforeTrigger,
}: SearchableSelectorFieldProps<TFieldValues, TItem, TTransformedValues>) {
  const fieldId = useId();

  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          {label && (
            <FieldLabel htmlFor={fieldId} aria-disabled={disabled}>
              {label}
              {requiredField && (
                <Asterisk className="-mt-2 size-3 text-destructive" />
              )}
            </FieldLabel>
          )}
          <SearchableSelectorFieldRender
            field={field}
            fieldState={fieldState}
            id={fieldId}
            disabled={disabled}
            multiple={multiple}
            placeholder={placeholder}
            searchDebounceMs={searchDebounceMs}
            onSearch={onSearch}
            data={data}
            isLoading={isLoading}
            isError={isError}
            error={error}
            title={title}
            contentDescription={contentDescription}
            searchPlaceholder={searchPlaceholder}
            loadingFallback={loadingFallback}
            emptyFallback={emptyFallback}
            errorFallback={errorFallback}
            getItemId={getItemId}
            renderItem={renderItem}
            renderTrigger={renderTrigger}
            renderBeforeTrigger={renderBeforeTrigger}
          />
          {description && (
            <FieldDescription
              className="flex items-start gap-1.5"
              aria-disabled={disabled}
            >
              {isDescriptionInfoIconShow && <Info className="mt-0.5 size-4" />}
              {description}
            </FieldDescription>
          )}
          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
        </Field>
      )}
    />
  );
}

interface SearchableSelectorFieldRenderProps<
  TFieldValues extends FieldValues,
  TItem,
> extends Omit<
  SearchableSelectorFieldProps<TFieldValues, TItem>,
  | "name"
  | "control"
  | "label"
  | "description"
  | "isDescriptionInfoIconShow"
  | "requiredField"
> {
  field: ControllerRenderProps<TFieldValues, Path<TFieldValues>>;
  fieldState: ControllerFieldState;
  id: string;
}

function SearchableSelectorFieldRender<
  TFieldValues extends FieldValues,
  TItem,
>({
  field,
  fieldState,
  id,
  disabled = false,
  multiple = false,
  placeholder = "Select",
  searchDebounceMs,
  onSearch,
  data,
  isLoading,
  isError,
  error,
  title,
  contentDescription,
  searchPlaceholder,
  loadingFallback,
  emptyFallback,
  errorFallback,
  getItemId,
  renderItem,
  renderTrigger,
  renderBeforeTrigger,
}: SearchableSelectorFieldRenderProps<TFieldValues, TItem>) {
  const fieldValue = field.value as SearchableSelectorValue | undefined;

  const selectedIds = useMemo(
    () =>
      Array.isArray(fieldValue) ? fieldValue : fieldValue ? [fieldValue] : [],
    [fieldValue]
  );

  const handleChange = useCallback(
    (value: SearchableSelectorValue | undefined) => {
      field.onChange(value);
    },
    [field]
  );

  const state = useMemo<SearchableSelectorFieldRenderState>(
    () => ({ value: fieldValue, selectedIds, onChange: handleChange }),
    [fieldValue, selectedIds, handleChange]
  );

  return (
    <div>
      {renderBeforeTrigger?.(state)}
      <SearchableSelector
        multiple={multiple}
        value={multiple ? selectedIds : fieldValue}
        onChange={handleChange}
        onSearch={onSearch}
        searchDebounceMs={searchDebounceMs}
        disabled={disabled}
      >
        <SearchableSelectorTrigger id={id} aria-invalid={fieldState.invalid}>
          {renderTrigger(state)}
        </SearchableSelectorTrigger>
        <SearchableSelectorContent
          data={data}
          isLoading={isLoading}
          isError={isError}
          error={error}
          title={title ?? placeholder}
          description={contentDescription}
          searchPlaceholder={searchPlaceholder}
          loadingFallback={loadingFallback}
          emptyFallback={emptyFallback}
          errorFallback={errorFallback}
        >
          {(item) => (
            <SearchableSelectorItem item={item} getItemId={getItemId}>
              {renderItem(item)}
            </SearchableSelectorItem>
          )}
        </SearchableSelectorContent>
      </SearchableSelector>
    </div>
  );
}
