import { firstValue } from './utils';

export function routeParam(value: string | string[] | undefined): string {
    return firstValue(value ?? '');
}
