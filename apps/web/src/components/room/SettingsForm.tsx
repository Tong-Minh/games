'use client';

import type { GameManifest } from '@games/game-sdk';
import { useMemo } from 'react';
import { z } from 'zod';

interface Field {
  key: string;
  label: string;
  kind: 'number' | 'boolean' | 'select';
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
}

const labelFor = (key: string) =>
  key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

/** Builds form fields from the game's zod settings schema (numbers, booleans and enums). */
function fieldsFor(manifest: GameManifest): Field[] {
  const json = z.toJSONSchema(manifest.settings, { io: 'input' }) as {
    properties?: Record<string, Record<string, unknown>>;
  };
  return Object.entries(json.properties ?? {}).flatMap(([key, prop]): Field[] => {
    const label = (prop.title as string) ?? labelFor(key);
    if (Array.isArray(prop.enum)) {
      return [{ key, label, kind: 'select', options: prop.enum.map(String) }];
    }
    if (prop.type === 'boolean') return [{ key, label, kind: 'boolean' }];
    if (prop.type === 'number' || prop.type === 'integer') {
      const field: Field = { key, label, kind: 'number', step: prop.type === 'integer' ? 1 : 0.1 };
      if (typeof prop.minimum === 'number') field.min = prop.minimum;
      if (typeof prop.maximum === 'number') field.max = prop.maximum;
      return [field];
    }
    return [];
  });
}

export function SettingsForm({
  manifest,
  values,
  editable,
  onChange,
}: {
  manifest: GameManifest;
  values: Record<string, unknown>;
  editable: boolean;
  onChange(patch: Record<string, unknown>): void;
}) {
  const fields = useMemo(() => fieldsFor(manifest), [manifest]);
  if (fields.length === 0) return null;

  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {fields.map((field) => {
        const id = `setting-${field.key}`;
        const value = values[field.key];
        return (
          <div key={field.key} className="flex items-center justify-between gap-3">
            <dt>
              <label htmlFor={id} className="text-sm">
                {field.label}
              </label>
            </dt>
            <dd>
              {!editable ? (
                <span className="font-medium">
                  {field.kind === 'boolean' ? (value ? 'On' : 'Off') : String(value)}
                </span>
              ) : field.kind === 'boolean' ? (
                <input
                  id={id}
                  type="checkbox"
                  checked={Boolean(value)}
                  onChange={(e) => onChange({ [field.key]: e.target.checked })}
                  className="size-4 accent-indigo-600"
                />
              ) : field.kind === 'select' ? (
                <select
                  id={id}
                  value={String(value)}
                  onChange={(e) => onChange({ [field.key]: e.target.value })}
                  className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                >
                  {field.options?.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              ) : (
                <input
                  id={id}
                  type="number"
                  value={Number(value)}
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  onChange={(e) => {
                    const next = e.target.valueAsNumber;
                    if (Number.isFinite(next)) onChange({ [field.key]: next });
                  }}
                  className="w-20 rounded-md border border-zinc-300 bg-white px-2 py-1 text-right text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
