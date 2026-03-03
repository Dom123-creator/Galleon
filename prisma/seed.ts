import { PrismaClient, DealSector, DealStatus } from "@prisma/client";

const prisma = new PrismaClient();

const sampleDeals: Array<{
  name: string;
  slug: string;
  description: string;
  borrowerName: string;
  lenderName: string;
  dealSize: number;
  currency: string;
  sector: DealSector;
  status: DealStatus;
  tags: string[];
}> = [
  {
    name: "Meridian Healthcare Refinancing",
    slug: "meridian-healthcare-refinancing",
    description:
      "Senior secured term loan refinancing for Meridian Healthcare Group, a mid-market healthcare services provider with 12 facilities across the Southeast.",
    borrowerName: "Meridian Healthcare Group",
    lenderName: "Atlas Capital Partners",
    dealSize: 150000000,
    currency: "USD",
    sector: DealSector.DIRECT_LENDING,
    status: DealStatus.UNDER_REVIEW,
    tags: ["healthcare", "refinancing", "senior secured"],
  },
  {
    name: "TechFlow SaaS Venture Debt",
    slug: "techflow-saas-venture-debt",
    description:
      "Venture debt facility for TechFlow Inc., a Series C enterprise SaaS company with $45M ARR and 130% net revenue retention.",
    borrowerName: "TechFlow Inc.",
    lenderName: "Summit Venture Lending",
    dealSize: 30000000,
    currency: "USD",
    sector: DealSector.VENTURE_DEBT,
    status: DealStatus.ACTIVE_RESEARCH,
    tags: ["saas", "venture debt", "technology"],
  },
  {
    name: "Greenfield Solar Infrastructure",
    slug: "greenfield-solar-infrastructure",
    description:
      "Infrastructure debt for a 200MW solar farm development in Arizona. Project finance structure with 15-year PPA in place.",
    borrowerName: "Greenfield Energy LLC",
    lenderName: "Blackrock Infrastructure",
    dealSize: 275000000,
    currency: "USD",
    sector: DealSector.INFRASTRUCTURE_DEBT,
    status: DealStatus.PROSPECT,
    tags: ["solar", "infrastructure", "project finance", "renewable"],
  },
  {
    name: "Apex Manufacturing Distressed",
    slug: "apex-manufacturing-distressed",
    description:
      "Distressed debt opportunity in Apex Manufacturing following covenant breach. Company operates 8 facilities with $500M revenue but faces liquidity challenges.",
    borrowerName: "Apex Manufacturing Corp",
    lenderName: "Cerberus Capital",
    dealSize: 85000000,
    currency: "USD",
    sector: DealSector.DISTRESSED_DEBT,
    status: DealStatus.UNDER_REVIEW,
    tags: ["distressed", "manufacturing", "restructuring"],
  },
];

async function main() {
  console.log("Starting seed...");

  // Note: Deals require a userId. This seed is for reference only.
  // In production, deals are created by authenticated users.
  console.log(`Sample deals defined: ${sampleDeals.length}`);
  console.log(
    "Deals require an authenticated user to create. Skipping auto-creation."
  );

  console.log("Seed completed!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
