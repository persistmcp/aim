import { createBrowserRouter, Navigate } from "react-router";
import { RouteError } from "./components/ErrorBoundary";
import { Layout } from "./components/Layout";
import { getToken } from "./lib/token";
import { Connect } from "./screens/Connect";
import { GoalHistory } from "./screens/GoalHistory";
import { History } from "./screens/History";
import { Home } from "./screens/Home";
import { Progress } from "./screens/Progress";
import { SessionDetail } from "./screens/SessionDetail";
import { Stopwatch } from "./screens/tools/Stopwatch";
import { Timer } from "./screens/tools/Timer";
import { Tools } from "./screens/tools/Tools";

// The token is the URL basename, so in-app links stay relative ("/", "/history", …).
export const router = createBrowserRouter(
  [
    {
      path: "/",
      Component: Layout,
      children: [
        {
          // Pathless wrapper: a screen crash renders the error inside Layout's outlet,
          // so the tab bar survives and the user can navigate away.
          errorElement: <RouteError />,
          children: [
            { index: true, Component: Home },
            { path: "history", Component: History },
            { path: "progress", Component: Progress },
            { path: "tools", Component: Tools },
            { path: "tools/stopwatch", Component: Stopwatch },
            { path: "tools/timer", Component: Timer },
            { path: "connect", Component: Connect },
            { path: "session/:id", Component: SessionDetail },
            { path: "goal-history", Component: GoalHistory },
            // No leaf route matches an unknown path: without this, RouterProvider renders
            // nothing at all (a silent blank page, tab bar included) instead of recovering.
            { path: "*", element: <Navigate to="/" replace /> },
          ],
        },
      ],
    },
  ],
  { basename: `/${getToken()}` },
);
