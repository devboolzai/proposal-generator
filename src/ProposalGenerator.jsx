import { useProposal } from "./state/useProposal";
import { styles } from "./styles/appStyles";
import Step1ClientDetails from "./steps/Step1ClientDetails";
import Step2Services from "./steps/Step2Services";
import Step3Pricing from "./steps/Step3Pricing";
import Step4Notes from "./steps/Step4Notes";
import Preview from "./steps/Preview";

const STEPS = [
  { num: 1, label: "פרטי לקוח", Component: Step1ClientDetails },
  { num: 2, label: "שירותים", Component: Step2Services },
  { num: 3, label: "תמחור", Component: Step3Pricing },
  { num: 4, label: "הערות ותנאים", Component: Step4Notes },
  { num: 5, label: "תצוגה מקדימה", Component: Preview },
];

const LAST_STEP = STEPS.length;

export default function ProposalGenerator() {
  const { step, setStep, setPreviewMode } = useProposal();

  const CurrentStep =
    STEPS.find((s) => s.num === step)?.Component ?? Step1ClientDetails;

  const goToPreview = () => {
    if (step === LAST_STEP - 1) setPreviewMode(true);
    setStep(LAST_STEP);
  };

  return (
    <div style={styles.app}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.headerTitle}>מחולל הצעות מחיר</h1>
          <p style={styles.headerSub}>Proposal Generator</p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          {step < LAST_STEP && (
            <button style={styles.btn("primary")} onClick={goToPreview}>
              תצוגה מקדימה →
            </button>
          )}
        </div>
      </div>

      <div style={styles.stepBar}>
        {STEPS.map((s) => (
          <div
            key={s.num}
            style={styles.stepItem(step === s.num, step > s.num)}
            onClick={() => setStep(s.num)}
          >
            {s.label}
          </div>
        ))}
      </div>

      <div style={styles.content}>
        <CurrentStep />

        {step < LAST_STEP && (
          <div style={styles.btnRow}>
            {step > 1 ? (
              <button style={styles.btn()} onClick={() => setStep(step - 1)}>
                → הקודם
              </button>
            ) : (
              <div />
            )}
            <button
              style={styles.btn("primary")}
              onClick={() => setStep(step + 1)}
            >
              הבא ←
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
