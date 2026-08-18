interface StrainRingProps {
  strain: number;
  size?: number;
}

export function StrainRing({ strain, size = 48 }: StrainRingProps) {
  const maxStrain = 21;
  const percentage = (strain / maxStrain) * 100;
  const circumference = 2 * Math.PI * 18;
  const strokeDashoffset = circumference - (circumference * percentage) / 100;

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg className="transform -rotate-90" width={size} height={size}>
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r="18"
          stroke="currentColor"
          strokeWidth="3"
          fill="none"
          className="text-muted/20"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r="18"
          stroke="currentColor"
          strokeWidth="3"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="text-accent transition-all duration-300"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs tabular-nums">{strain}</span>
      </div>
    </div>
  );
}
