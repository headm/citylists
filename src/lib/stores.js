import { writable } from 'svelte/store';

export const selectedCity = writable('San Francisco');
export const activeFilters = writable({});
export const places = writable([]);
