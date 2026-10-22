import type { Metadata } from "next";
import "@assets/styles/globals.css";
import {DataProvider} from "@context/DataContext";
import {ReactNode} from "react";
import {Toaster} from "sonner";
import {CsvProvider} from "@context/CsvContext";

export const metadata: Metadata = {
  title: "ProSim-ST · Short-term business process simulation",
  description: "Simulate the short-term future of a running business process from its event log, BPMN model and simulation parameters.",
};

const RootLayout = ({ children }: Readonly<{ children: ReactNode; }>) => {
  return (
    <html lang="en">
      <body className={'antialiased2'}>
        <h1>Short-term Business Process Simulation</h1>

        <DataProvider>
          <CsvProvider>
            {children}
            <Toaster richColors position="top-right" />
          </CsvProvider>
        </DataProvider>
      </body>
    </html>
  );
}

export default RootLayout;
