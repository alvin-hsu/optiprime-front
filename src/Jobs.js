import React from "react";
import {
  Table,
  TableCell,
  TableBody,
  TableHead,
  TableRow,
} from "@aws-amplify/ui-react";

export default function Jobs() {
    return (
        <>
            <Table
                caption=""
                size="small"
                highlightOnHover={true}
                width="80%"
            >
                <TableHead borderWidth="1px" borderColor="black">
                  <TableRow style={{ borderColor: "black", borderWidth: "2px" }}>
                    <TableCell as="th">Citrus</TableCell>
                    <TableCell as="th">Stone Fruit</TableCell>
                    <TableCell as="th">Berry</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  <TableRow>
                    <TableCell>Orange</TableCell>
                    <TableCell>Nectarine</TableCell>
                    <TableCell>Raspberry</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Grapefruit</TableCell>
                    <TableCell>Apricot</TableCell>
                    <TableCell>Blueberry</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Lime</TableCell>
                    <TableCell>Peach</TableCell>
                    <TableCell>Strawberry</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
        </>
    )
}
