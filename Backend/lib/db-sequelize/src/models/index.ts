import { User } from "./User";
import { Role } from "./Role";
import { Permission } from "./Permission";
import { RolePermission } from "./RolePermission";
import { UserRole } from "./UserRole";
import { AuditLog } from "./AuditLog";
import { TrashItem } from "./TrashItem";
import { Delegation } from "./Delegation";
import { Currency } from "./Currency";
import { CompanySetting } from "./CompanySetting";
import { DocumentSequence } from "./DocumentSequence";
import { Project } from "./Project";
import { BlockGroup } from "./BlockGroup";
import { Block } from "./Block";
import { Floor } from "./Floor";
import { UnitType } from "./UnitType";
import { Unit, MANUALLY_SETTABLE_UNIT_STATUSES } from "./Unit";
import { Account } from "./Account";
import { CashAccount } from "./CashAccount";
import { JournalTransaction } from "./JournalTransaction";
import { JournalLine } from "./JournalLine";
import { DailyCashEntry } from "./DailyCashEntry";
import { PostingLink } from "./PostingLink";
import { FiscalPeriod } from "./FiscalPeriod";
import { Party } from "./Party";
import { PartyRole } from "./PartyRole";
import { Sale } from "./Sale";
import { SaleDocument } from "./SaleDocument";
import { SaleReceipt } from "./SaleReceipt";
import { SaleCredit } from "./SaleCredit";
import { Rental } from "./Rental";
import { RentalReceipt } from "./RentalReceipt";
import { Expense } from "./Expense";
import { Purchase } from "./Purchase";
import { PurchasePayment } from "./PurchasePayment";
import { PurchaseReturn } from "./PurchaseReturn";
import { Employee } from "./Employee";
import { Attendance } from "./Attendance";
import { EmployeePayment } from "./EmployeePayment";
import { EmployeeWorkPeriod } from "./EmployeeWorkPeriod";
import { EmployeeDocument } from "./EmployeeDocument";
import { ExchangeTransaction } from "./ExchangeTransaction";
import { CompanyPartner } from "./CompanyPartner";
import { Partner } from "./Partner";
import { PartnerTransaction } from "./PartnerTransaction";
export type { UnitStatus, UnitPurpose } from "./Unit";
export type { ProjectStatus } from "./Project";
export type { FloorPurpose, FloorType } from "./Floor";
export type { AccountType } from "./Account";
export type { JournalDirection, PartyType as JournalPartyType } from "./JournalLine";
export type { DailyCashCategory, DailyCashEntryType, DailyCashTargetType } from "./DailyCashEntry";
export type { PartyType } from "./Party";
export type { SaleStatus } from "./Sale";
export type { RentalStatus, RentalFrequency } from "./Rental";
export type { ExpenseCategory } from "./Expense";
export type { PurchaseStatus } from "./Purchase";
export type { EmployeeWageType, EmployeeStatus, EmployeeWorkerType } from "./Employee";
export type { AttendanceStatus } from "./Attendance";
export type { EmployeePaymentType } from "./EmployeePayment";
export type { CompanyPartnerStatus } from "./CompanyPartner";
export type { PartnerStatus } from "./Partner";
export type { PartnerTransactionType } from "./PartnerTransaction";

// Associations
User.belongsToMany(Role, { through: UserRole, foreignKey: "userId", otherKey: "roleId", as: "roles" });
Role.belongsToMany(User, { through: UserRole, foreignKey: "roleId", otherKey: "userId", as: "users" });
Role.belongsToMany(Permission, { through: RolePermission, foreignKey: "roleId", otherKey: "permissionId", as: "permissions" });
Permission.belongsToMany(Role, { through: RolePermission, foreignKey: "permissionId", otherKey: "roleId", as: "roles" });
AuditLog.belongsTo(User, { foreignKey: "userId", as: "user" });
TrashItem.belongsTo(User, { foreignKey: "deletedByUserId", as: "deletedBy" });
TrashItem.belongsTo(User, { foreignKey: "purgedByUserId", as: "purgedBy" });
User.hasMany(Delegation, { foreignKey: "delegatedUserId", as: "delegations" });
User.hasMany(Delegation, { foreignKey: "delegatedByUserId", as: "createdDelegations" });
Delegation.belongsTo(User, { foreignKey: "delegatedUserId", as: "delegatedUser" });
Delegation.belongsTo(User, { foreignKey: "delegatedByUserId", as: "delegatedBy" });

Project.hasMany(BlockGroup, { foreignKey: "projectId", as: "blockGroups" });
Project.hasMany(Block, { foreignKey: "projectId", as: "blocks" });
BlockGroup.belongsTo(Project, { foreignKey: "projectId", as: "project" });
BlockGroup.hasMany(Block, { foreignKey: "blockGroupId", as: "blocks" });
Block.belongsTo(Project, { foreignKey: "projectId", as: "project" });
Block.belongsTo(BlockGroup, { foreignKey: "blockGroupId", as: "blockGroup" });
Block.hasMany(Floor, { foreignKey: "blockId", as: "floors" });
Floor.belongsTo(Block, { foreignKey: "blockId", as: "block" });
Floor.belongsTo(UnitType, { foreignKey: "unitTypeId", as: "unitType" });
Floor.hasMany(Unit, { foreignKey: "floorId", as: "units" });
Unit.belongsTo(Floor, { foreignKey: "floorId", as: "floor" });
Unit.belongsTo(UnitType, { foreignKey: "unitTypeId", as: "unitType" });
UnitType.hasMany(Unit, { foreignKey: "unitTypeId", as: "units" });

JournalTransaction.hasMany(JournalLine, { foreignKey: "transactionId", as: "lines" });
JournalLine.belongsTo(JournalTransaction, { foreignKey: "transactionId", as: "transaction" });
JournalLine.belongsTo(Account, { foreignKey: "accountId", as: "account" });
Account.hasMany(JournalLine, { foreignKey: "accountId", as: "lines" });
CashAccount.belongsTo(Account, { foreignKey: "accountId", as: "account" });
DailyCashEntry.belongsTo(JournalTransaction, { foreignKey: "journalTransactionId", as: "journalTransaction" });
PostingLink.belongsTo(JournalTransaction, { foreignKey: "transactionId", as: "transaction" });
JournalTransaction.belongsTo(JournalTransaction, { foreignKey: "reversalOfId", as: "reversalOf" });

Party.hasMany(PartyRole, { foreignKey: "partyId", as: "roles" });
PartyRole.belongsTo(Party, { foreignKey: "partyId", as: "party" });

Sale.belongsTo(Unit, { foreignKey: "unitId", as: "unit" });
Sale.belongsTo(Party, { foreignKey: "partyId", as: "party" });
Unit.hasMany(Sale, { foreignKey: "unitId", as: "sales" });
Party.hasMany(Sale, { foreignKey: "partyId", as: "sales" });
Sale.hasMany(SaleReceipt, { foreignKey: "saleId", as: "receipts" });
SaleReceipt.belongsTo(Sale, { foreignKey: "saleId", as: "sale" });
Sale.hasMany(SaleDocument, { foreignKey: "saleId", as: "documents" });
SaleDocument.belongsTo(Sale, { foreignKey: "saleId", as: "sale" });
SaleReceipt.belongsTo(CashAccount, { foreignKey: "cashAccountId", as: "cashAccount" });
SaleCredit.belongsTo(Party, { foreignKey: "partyId", as: "party" });
SaleCredit.belongsTo(Sale, { foreignKey: "sourceSaleId", as: "sourceSale" });

Rental.belongsTo(Unit, { foreignKey: "unitId", as: "unit" });
Rental.belongsTo(Party, { foreignKey: "tenantPartyId", as: "tenant" });
Unit.hasMany(Rental, { foreignKey: "unitId", as: "rentals" });
Party.hasMany(Rental, { foreignKey: "tenantPartyId", as: "rentals" });
Rental.hasMany(RentalReceipt, { foreignKey: "rentalId", as: "receipts" });
RentalReceipt.belongsTo(Rental, { foreignKey: "rentalId", as: "rental" });
RentalReceipt.belongsTo(CashAccount, { foreignKey: "cashAccountId", as: "cashAccount" });

Expense.belongsTo(Party, { foreignKey: "payeePartyId", as: "payeeParty" });
Expense.belongsTo(Project, { foreignKey: "projectId", as: "project" });
Expense.belongsTo(CashAccount, { foreignKey: "cashAccountId", as: "cashAccount" });

Purchase.belongsTo(Party, { foreignKey: "supplierPartyId", as: "supplier" });
Party.hasMany(Purchase, { foreignKey: "supplierPartyId", as: "purchases" });
Purchase.hasMany(PurchasePayment, { foreignKey: "purchaseId", as: "payments" });
PurchasePayment.belongsTo(Purchase, { foreignKey: "purchaseId", as: "purchase" });
PurchasePayment.belongsTo(CashAccount, { foreignKey: "cashAccountId", as: "cashAccount" });
Purchase.hasMany(PurchaseReturn, { foreignKey: "purchaseId", as: "returns" });
PurchaseReturn.belongsTo(Purchase, { foreignKey: "purchaseId", as: "purchase" });

Employee.hasMany(Attendance, { foreignKey: "employeeId", as: "attendances" });
Attendance.belongsTo(Employee, { foreignKey: "employeeId", as: "employee" });
Employee.hasMany(EmployeePayment, { foreignKey: "employeeId", as: "payments" });
EmployeePayment.belongsTo(Employee, { foreignKey: "employeeId", as: "employee" });
EmployeePayment.belongsTo(CashAccount, { foreignKey: "cashAccountId", as: "cashAccount" });
Employee.hasMany(EmployeeWorkPeriod, { foreignKey: "employeeId", as: "workPeriods" });
EmployeeWorkPeriod.belongsTo(Employee, { foreignKey: "employeeId", as: "employee" });
Employee.hasMany(EmployeeDocument, { foreignKey: "employeeId", as: "documents" });
EmployeeDocument.belongsTo(Employee, { foreignKey: "employeeId", as: "employee" });

ExchangeTransaction.belongsTo(Party, { foreignKey: "partyId", as: "party" });
Party.hasMany(ExchangeTransaction, { foreignKey: "partyId", as: "exchanges" });

Partner.belongsTo(Party, { foreignKey: "partyId", as: "party" });
Party.hasOne(Partner, { foreignKey: "partyId", as: "partner" });
Partner.hasMany(PartnerTransaction, { foreignKey: "partnerId", as: "transactions" });
PartnerTransaction.belongsTo(Partner, { foreignKey: "partnerId", as: "partner" });

export {
  User,
  Role,
  Permission,
  RolePermission,
  UserRole,
  AuditLog,
  TrashItem,
  Delegation,
  Currency,
  CompanySetting,
  DocumentSequence,
  Project,
  BlockGroup,
  Block,
  Floor,
  UnitType,
  Unit,
  MANUALLY_SETTABLE_UNIT_STATUSES,
  Account,
  CashAccount,
  JournalTransaction,
  JournalLine,
  DailyCashEntry,
  PostingLink,
  FiscalPeriod,
  Party,
  PartyRole,
  Sale,
  SaleDocument,
  SaleReceipt,
  SaleCredit,
  Rental,
  RentalReceipt,
  Expense,
  Purchase,
  PurchasePayment,
  PurchaseReturn,
  Employee,
  Attendance,
  EmployeePayment,
  EmployeeWorkPeriod,
  EmployeeDocument,
  ExchangeTransaction,
  CompanyPartner,
  Partner,
  PartnerTransaction,
};
