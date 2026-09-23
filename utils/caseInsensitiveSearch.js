const toLowerString = (fieldRef) => ({
  $toLower: {
    $convert: {
      input: fieldRef,
      to: "string",
      onError: "",
      onNull: "",
    },
  },
});

const fieldHasNeedle = (field, needle) => ({
  $gte: [{ $indexOfCP: [toLowerString(`$${field}`), needle] }, 0],
});

const searchPathsFor = (field) => [
  field,
  `${field}.en`,
  `${field}.gu`,
  `${field}En`,
  `${field}Gu`,
];

const containsAny = (value, fields = []) => {
  const raw = String(value ?? "").trim();
  if (!raw || !fields.length) {
    return {};
  }
  const needle = raw.toLocaleLowerCase();
  const paths = [...new Set(fields.flatMap(searchPathsFor))];
  return {
    $expr: {
      $or: paths.map((field) => fieldHasNeedle(field, needle)),
    },
  };
};

const mergeAnd = (...parts) => {
  const clauses = parts.filter(
    (part) => part && typeof part === "object" && Object.keys(part).length > 0
  );
  if (!clauses.length) {
    return {};
  }
  if (clauses.length === 1) {
    return clauses[0];
  }
  return { $and: clauses };
};

module.exports = { containsAny, mergeAnd };
