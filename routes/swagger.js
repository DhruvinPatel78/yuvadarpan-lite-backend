/**
 * @swagger
 * components:
 *   securitySchemes:
 *     bearerAuth: # arbitrary name for the security scheme
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *   schemas:
 *     User:
 *       type: object
 *       required:
 *         - firstName
 *         - middleName
 *         - lastName
 *         - password
 *         - email
 *         - mobile
 *         - familyId
 *         - dob
 *         - region_id
 *         - samaj_id
 *         - active
 *         - allowed
 *         - role
 *         - createdAt
 *         - createdBy
 *         - updatedAt
 *         - updatedBy
 *       properties:
 *         id:
 *           type: string
 *           description: The auto-generated id of the book
 *         firstName:
 *           type: string
 *           description: First name of the user
 *         middleName:
 *           type: string
 *           description: Middle name of the user
 *         lastName:
 *           type: string
 *           description: Last name of the user
 *         password:
 *           type: string
 *           description: Password of the user
 *         email:
 *           type: string
 *           description: Email of the user
 *         mobile:
 *           type: string
 *           description: mobile of the user
 *         familyId:
 *           type: number
 *           description: Family ID of the user
 *         dob:
 *           type: string
 *           description: Date of birth of user
 *         region_id:
 *           type: string
 *           description: Region of user
 *         samaj_id:
 *           type: string
 *           description: Samaj of user
 *         active:
 *           type: boolean
 *           description: user is active or not
 *         allowed:
 *           type: boolean
 *           description: user is allowed or not
 *         role:
 *           type: string
 *           description: Role of user
 *         createdAt:
 *           type: string
 *           description: The date the user was created
 *         updatedAt:
 *           type: string
 *           description: The date the user was updated
 *         createdBy:
 *           type: string
 *           description: The user id the user was created
 *         updatedBy:
 *           type: string
 *           description: The user id the user was updated
 *       example:
 *         id: d5fE_asz
 *         title: The New Turing Omnibus
 *         author: Alexander K. Dewdney
 *         finished: false
 *         createdAt: 2020-03-10T04:05:06.157Z
 */

/**
 * @swagger
 * tags:
 *   name: User
 *   description: The user managing API
 * /user/signIn:
 *   post:
 *     summary: User login API
 *     tags: [User]
 *     security:
 *         - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *              - email
 *              - password
 *             properties:
 *              email:
 *                type: string
 *              password:
 *                type: string
 *           example:
 *            email: ""
 *            password: ""
 *
 */
