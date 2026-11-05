import {Menu, MenuButton, MenuItem, MenuItems} from "@headlessui/react";

type Props = {
    processId: string;
    onSnapshot: (format: "png" | "svg") => void;
};

const ExportMenu = ({processId, onSnapshot}: Props) => (
    <Menu>
        <MenuButton className="toolbar-btn">Export</MenuButton>
        <MenuItems anchor={{to: "bottom start", gap: 4}} className="export-menu">
            <MenuItem><a href={`/api/simulation/${processId}/export?type=log`} download>Simulated log (CSV)</a></MenuItem>
            <MenuItem><a href={`/api/simulation/${processId}/export?type=activities`} download>Activity statistics (CSV)</a></MenuItem>
            <MenuItem><button type="button" onClick={() => onSnapshot("png")}>Diagram now (PNG)</button></MenuItem>
            <MenuItem><button type="button" onClick={() => onSnapshot("svg")}>Diagram now (SVG)</button></MenuItem>
        </MenuItems>
    </Menu>
);

export default ExportMenu;
