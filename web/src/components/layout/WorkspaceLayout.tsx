import { type ReactNode } from "react";
import { Allotment } from "allotment";
import "allotment/dist/style.css";

interface WorkspaceLayoutProps {
  left: ReactNode;
  right: ReactNode;
}

export function WorkspaceLayout({ left, right }: WorkspaceLayoutProps) {
  return (
    <div className="flex-1 flex overflow-hidden">
      <Allotment>
        <Allotment.Pane preferredSize="50%">{left}</Allotment.Pane>
        <Allotment.Pane preferredSize="50%">{right}</Allotment.Pane>
      </Allotment>
    </div>
  );
}
