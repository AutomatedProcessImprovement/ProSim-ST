import {render, screen} from "@testing-library/react";
import TaskPanel from "@components/simulation/TaskPanel";

const HOUR = 3600000;
const NOW = Date.UTC(2025, 3, 4, 12);

describe("TaskPanel", () => {
    const show = (queue: Array<{caseId: number; state: "waiting" | "working"; since: number | null; arrival: number | null}>) => render(<TaskPanel
        taskId="t"
        name="AML Check"
        stats={{name: "AML Check", _count: 4, averageWT: 0, averagePT: HOUR / 2, incompleteCases: {}}}
        analysis={null}
        utcOffset="+00:00"
        getQueue={() => queue}
        getCurrentTime={() => NOW}
        followedCase={null}
        onFollowCase={jest.fn()}
        onClose={jest.fn()}
    />);

    it("shows the longest wait of the cases still waiting next to the finished average", () => {
        show([
            {caseId: 1, state: "waiting", since: NOW - 6 * HOUR, arrival: null},
            {caseId: 2, state: "waiting", since: NOW - HOUR, arrival: null},
            {caseId: 3, state: "working", since: NOW - 9 * HOUR, arrival: null},
        ]);

        expect(screen.getByText("Longest wait right now: 6 h")).toBeInTheDocument();
        expect(screen.getByText("(4 finished)")).toBeInTheDocument();
    });

    it("leaves it out when nobody is waiting", () => {
        show([{caseId: 3, state: "working", since: NOW - 9 * HOUR, arrival: null}]);

        expect(screen.queryByText(/Longest wait/)).not.toBeInTheDocument();
    });
});
