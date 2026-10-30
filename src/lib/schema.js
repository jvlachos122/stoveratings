import { site } from "./site.js";

export function datasetLd(meta) {
  return {
    "@type": "Dataset",
    name: "EPA Certified Wood Heater Database snapshot",
    description: `Certification rows from the EPA Certified Wood Heater Database, saved ${meta.snapshotDate}. Emission rates and HHV efficiencies are EPA's figures. StoveRatings does not score stoves.`,
    url: new URL("/methodology/", site.url).href,
    creator: {
      "@type": "Organization",
      name: "U.S. Environmental Protection Agency",
      url: "https://www.epa.gov/",
    },
    publisher: {
      "@type": "Organization",
      name: site.name,
      url: site.url,
    },
    datePublished: meta.snapshotDate,
    license: "https://www.usa.gov/government-works",
    isAccessibleForFree: true,
    isBasedOn: meta.sourceUrl,
  };
}

export function webAppLd(name, description, path) {
  return {
    "@type": "WebApplication",
    name,
    description,
    url: new URL(path, site.url).href,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Any",
    isAccessibleForFree: true,
    creator: {
      "@type": "Organization",
      name: site.name,
      url: site.url,
    },
    publisher: {
      "@type": "Organization",
      name: site.legalName,
      url: site.url,
    },
    provider: {
      "@type": "Organization",
      name: site.legalName,
      url: site.url,
    },
  };
}

export function articleLd(headline, description, path, date) {
  return {
    "@type": "Article",
    headline,
    description,
    datePublished: date,
    dateModified: date,
    mainEntityOfPage: new URL(path, site.url).href,
    author: {
      "@type": "Organization",
      name: site.name,
      url: site.url,
    },
    publisher: {
      "@type": "Organization",
      name: site.legalName,
    },
  };
}

export function faqLd(pairs) {
  return {
    "@type": "FAQPage",
    mainEntity: pairs.map((pair) => ({
      "@type": "Question",
      name: pair.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: pair.answer,
      },
    })),
  };
}
