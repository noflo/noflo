/**
 * Extracts a field from an assembly message and sends its value — the
 * inport-side adapter the `asAssembly` generated graphs wire between the
 * message fanout and the inner component's inports.
 *
 * The field name comes from the graph node's `field` metadata, which the
 * loader passes to `getComponent`.
 */
export class ExtractField extends Component {
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
}): ExtractField;
import Component from "@noflo/assembly";
