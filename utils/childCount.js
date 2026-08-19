const getDocKeys = (doc) =>
  [...new Set([doc?.id, doc?._id && String(doc._id)].filter(Boolean))];

const idOrObjectIdFilter = (id) => {
  const filter = [{ id: { $eq: id } }];
  if (/^[0-9a-fA-F]{24}$/.test(id)) {
    filter.push({ _id: id });
  }
  return { $or: filter };
};

const attachChildCounts = async (docs, ChildModel, foreignKey, countField) => {
  const keys = [...new Set(docs.flatMap(getDocKeys))];
  if (!keys.length) {
    return docs.map((doc) => {
      const json = typeof doc.toJSON === "function" ? doc.toJSON() : { ...doc };
      json[countField] = 0;
      return json;
    });
  }
  const counts = await ChildModel.aggregate([
    { $match: { [foreignKey]: { $in: keys } } },
    { $group: { _id: `$${foreignKey}`, count: { $sum: 1 } } },
  ]);
  const countMap = Object.fromEntries(
    counts.map((item) => [String(item._id), item.count])
  );
  return docs.map((doc) => {
    const json = typeof doc.toJSON === "function" ? doc.toJSON() : { ...doc };
    const uuidCount = doc.id ? countMap[doc.id] || 0 : 0;
    const objectIdCount = doc._id ? countMap[String(doc._id)] || 0 : 0;
    json[countField] =
      doc.id && String(doc._id) && doc.id !== String(doc._id)
        ? uuidCount + objectIdCount
        : objectIdCount || uuidCount;
    return json;
  });
};

const findChildrenByParent = async (ParentModel, ChildModel, id, foreignKey) => {
  const parent = await ParentModel.findOne(idOrObjectIdFilter(id));
  const keys = [...new Set([id, ...(parent ? getDocKeys(parent) : [])])];
  return ChildModel.find({ [foreignKey]: { $in: keys } });
};

const findByAnyId = async (Model, id) => Model.find(idOrObjectIdFilter(id));

const idsFilter = (ids = []) => {
  const values = (Array.isArray(ids) ? ids : [ids]).filter(Boolean).map(String);
  const objectIds = values.filter((value) => /^[0-9a-fA-F]{24}$/.test(value));
  return {
    $or: [
      { id: { $in: values } },
      ...(objectIds.length ? [{ _id: { $in: objectIds } }] : []),
    ],
  };
};

const sanitizeUpdatePayload = (payload = {}) => {
  const { id, _id, __v, ...rest } = payload;
  return rest;
};

module.exports = {
  attachChildCounts,
  findChildrenByParent,
  findByAnyId,
  idOrObjectIdFilter,
  idsFilter,
  sanitizeUpdatePayload,
};
