import Link from "next/link";
import { ManualJobControls } from "@/components/manual-job-controls";

type SettingRow = {
  key: string;
  description: string;
  value: number;
};

const tunableEnv = {
  STARTING_ELO: Number(process.env.STARTING_ELO ?? 1500),
  K_FACTOR: Number(process.env.K_FACTOR ?? 30),
  HOME_ADVANTAGE_ELO: Number(process.env.HOME_ADVANTAGE_ELO ?? 50),
  VALUE_EDGE_THRESHOLD: Number(process.env.VALUE_EDGE_THRESHOLD ?? 0.04),
  CONFIDENCE_MEDIUM_THRESHOLD: Number(process.env.CONFIDENCE_MEDIUM_THRESHOLD ?? 0.03),
  CONFIDENCE_HIGH_THRESHOLD: Number(process.env.CONFIDENCE_HIGH_THRESHOLD ?? 0.06)
};

const tunableSettings: SettingRow[] = [
  {
    key: "STARTING_ELO",
    description: "Initial Elo rating assigned to teams before match updates are processed.",
    value: tunableEnv.STARTING_ELO
  },
  {
    key: "K_FACTOR",
    description: "Sensitivity of Elo updates after each finished match.",
    value: tunableEnv.K_FACTOR
  },
  {
    key: "HOME_ADVANTAGE_ELO",
    description: "Elo points added to the home team before win probability is calculated.",
    value: tunableEnv.HOME_ADVANTAGE_ELO
  },
  {
    key: "VALUE_EDGE_THRESHOLD",
    description: "Minimum edge needed for the model to flag a value opportunity.",
    value: tunableEnv.VALUE_EDGE_THRESHOLD
  },
  {
    key: "CONFIDENCE_MEDIUM_THRESHOLD",
    description: "Edge threshold used to classify a prediction as MEDIUM confidence.",
    value: tunableEnv.CONFIDENCE_MEDIUM_THRESHOLD
  },
  {
    key: "CONFIDENCE_HIGH_THRESHOLD",
    description: "Edge threshold used to classify a prediction as HIGH confidence.",
    value: tunableEnv.CONFIDENCE_HIGH_THRESHOLD
  }
];

function formatSettingValue(key: string, value: number) {
  if (key.includes("THRESHOLD")) return `${(value * 100).toFixed(2)}%`;
  return value.toString();
}

export default function SettingsPage() {
  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-4xl font-bold">Model Settings</h1>
        <Link href="/" className="rounded bg-slate-800 px-3 py-2 text-sm">
          Back to predictions
        </Link>
      </div>

      <p className="mb-6 text-sm text-slate-300">
        This page lists the model variables you can tune. API and database variables are intentionally excluded.
      </p>

      <section className="overflow-hidden rounded border border-slate-700">
        <table className="min-w-full divide-y divide-slate-700 text-sm">
          <thead className="bg-slate-900/60 text-left">
            <tr>
              <th className="px-4 py-3 font-semibold">Variable</th>
              <th className="px-4 py-3 font-semibold">Current Value</th>
              <th className="px-4 py-3 font-semibold">What it controls</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {tunableSettings.map((setting) => (
              <tr key={setting.key}>
                <td className="px-4 py-3 font-mono text-xs sm:text-sm">{setting.key}</td>
                <td className="px-4 py-3">{formatSettingValue(setting.key, setting.value)}</td>
                <td className="px-4 py-3 text-slate-300">{setting.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <ManualJobControls />
    </main>
  );
}
