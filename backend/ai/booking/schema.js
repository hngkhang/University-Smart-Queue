const { z } = require("zod");

const bookingSchema = z.strictObject({
  intent: z.enum(["booking", "out_of_scope"]),
  departmentId: z.string().regex(/^[a-fA-F0-9]{24}$/).nullable(),
  services: z.array(z.string().min(1).max(200).regex(/\S/)).max(50),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  timePreference: z.strictObject({
    period: z.enum(["any", "morning", "afternoon", "evening"]),
    time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).nullable(),
  }).nullable(),
  notes: z.string().max(1000),
  ambiguousFields: z.array(z.enum(["departmentId", "services", "date", "timePreference"])).max(4),
});

const { $schema: _dialect, ...bookingJsonSchema } = z.toJSONSchema(bookingSchema);
module.exports = { bookingSchema, bookingJsonSchema };
