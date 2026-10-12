/**
 * Writes a value into a field of an assembly message — the inverse of
 * `ExtractField`. The field name comes from the graph node's `field`
 * metadata, which the loader passes to `getComponent`.
 */
export class ToField extends Component {
    /**
     * @param {{ field?: string }} [metadata]
     */
    constructor(metadata?: {
        field?: string;
    });
    field: string;
    processMessage(input: any, output: any): void;
}
export function getComponent(metadata: {
    field?: string;
}): ToField;
import Component from "@noflo/assembly";
