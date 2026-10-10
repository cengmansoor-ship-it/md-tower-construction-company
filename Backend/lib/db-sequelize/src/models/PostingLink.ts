import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes } from "sequelize";
import { sequelize } from "../connection";

/** Guarantees a source business record posts to the journal exactly once per posting type. */
export class PostingLink extends Model<InferAttributes<PostingLink>, InferCreationAttributes<PostingLink>> {
  declare id: CreationOptional<number>;
  declare sourceModule: string;
  declare sourceId: number;
  declare postingType: string;
  declare transactionId: number;
}

PostingLink.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    sourceModule: { type: DataTypes.STRING(64), allowNull: false },
    sourceId: { type: DataTypes.INTEGER, allowNull: false },
    postingType: { type: DataTypes.STRING(64), allowNull: false },
    transactionId: { type: DataTypes.INTEGER, allowNull: false },
  },
  {
    sequelize,
    modelName: "PostingLink",
    tableName: "posting_links",
    timestamps: false,
    indexes: [{ unique: true, fields: ["sourceModule", "sourceId", "postingType"] }],
  },
);
