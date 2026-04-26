import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders token optimizer dashboard", () => {
  render(<App />);
  expect(screen.getByText(/Token Optimizer/i)).toBeInTheDocument();
  expect(screen.getByText(/Conversation/i)).toBeInTheDocument();
  expect(screen.getByText(/Metrics/i)).toBeInTheDocument();
});
