import { firstValue } from './utils';

export function routeParam(value: string | string[]): string {
    return firstValue(value);
}
